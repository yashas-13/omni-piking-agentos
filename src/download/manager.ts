import { createWriteStream, existsSync, statSync, readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { pipeline } from 'stream/promises';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

export interface DownloadTask {
  id: string;
  url: string;
  destination: string;
  filename: string;
  status: DownloadStatus;
  progress: number;
  totalBytes?: number;
  downloadedBytes: number;
  speed: number;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  retries: number;
  maxRetries: number;
  checksum?: string;
  expectedChecksum?: string;
}

export type DownloadStatus = 'pending' | 'downloading' | 'paused' | 'completed' | 'failed' | 'verifying';

export interface DownloadOptions {
  filename?: string;
  headers?: Record<string, string>;
  maxRetries?: number;
  timeout?: number;
  expectedChecksum?: string;
  checksumAlgorithm?: 'md5' | 'sha1' | 'sha256';
}

export class DownloadManager extends EventEmitter {
  private downloads: Map<string, DownloadTask> = new Map();
  private activeDownloads: Map<string, AbortController> = new Map();
  private downloadsPath: string;

  constructor(downloadsPath: string) {
    super();
    this.downloadsPath = downloadsPath;
  }

  async download(url: string, options: DownloadOptions = {}): Promise<DownloadTask> {
    const id = randomUUID();
    const filename = options.filename || url.split('/').pop() || 'download';
    const destination = join(this.downloadsPath, filename);

    const task: DownloadTask = {
      id,
      url,
      destination,
      filename,
      status: 'pending',
      progress: 0,
      downloadedBytes: 0,
      speed: 0,
      startedAt: new Date(),
      retries: 0,
      maxRetries: options.maxRetries ?? 3,
      expectedChecksum: options.expectedChecksum
    };

    this.downloads.set(id, task);
    this.emit('downloadQueued', task);

    await this.startDownload(task, options);
    return task;
  }

  private async startDownload(task: DownloadTask, options: DownloadOptions): Promise<void> {
    const controller = new AbortController();
    this.activeDownloads.set(task.id, controller);

    task.status = 'downloading';
    this.emit('downloadStarted', task);

    try {
      const response = await fetch(task.url, {
        signal: controller.signal,
        headers: options.headers
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentLength = response.headers.get('content-length');
      task.totalBytes = contentLength ? parseInt(contentLength, 10) : undefined;

      const fileStream = createWriteStream(task.destination);
      const reader = response.body?.getReader();

      if (!reader) {
        throw new Error('No response body');
      }

      let lastTime = Date.now();
      let lastBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        fileStream.write(value);
        task.downloadedBytes += value.length;

        const now = Date.now();
        const elapsed = (now - lastTime) / 1000;
        if (elapsed > 0.5) {
          task.speed = (task.downloadedBytes - lastBytes) / elapsed;
          lastBytes = task.downloadedBytes;
          lastTime = now;
        }

        if (task.totalBytes) {
          task.progress = (task.downloadedBytes / task.totalBytes) * 100;
        }

        this.emit('downloadProgress', {
          id: task.id,
          progress: task.progress,
          downloadedBytes: task.downloadedBytes,
          totalBytes: task.totalBytes,
          speed: task.speed
        });
      }

      fileStream.end();

      if (task.expectedChecksum) {
        task.status = 'verifying';
        this.emit('downloadVerifying', task);

        const verified = await this.verifyChecksum(task.destination, task.expectedChecksum);
        if (!verified) {
          throw new Error('Checksum verification failed');
        }
      }

      task.status = 'completed';
      task.progress = 100;
      task.completedAt = new Date();
      this.emit('downloadCompleted', task);

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        task.status = 'paused';
        this.emit('downloadPaused', task);
        return;
      }

      task.retries++;
      
      if (task.retries <= task.maxRetries) {
        this.emit('downloadRetrying', { id: task.id, retry: task.retries });
        await new Promise(resolve => setTimeout(resolve, 1000 * task.retries));
        await this.startDownload(task, options);
      } else {
        task.status = 'failed';
        task.error = err instanceof Error ? err.message : String(err);
        this.emit('downloadFailed', task);
      }
    } finally {
      this.activeDownloads.delete(task.id);
    }
  }

  pause(id: string): boolean {
    const controller = this.activeDownloads.get(id);
    if (!controller) return false;

    controller.abort();
    return true;
  }

  resume(id: string): boolean {
    const task = this.downloads.get(id);
    if (!task || task.status !== 'paused') return false;

    this.startDownload(task, {});
    return true;
  }

  cancel(id: string): boolean {
    const controller = this.activeDownloads.get(id);
    if (controller) {
      controller.abort();
      this.activeDownloads.delete(id);
    }

    const task = this.downloads.get(id);
    if (task) {
      task.status = 'failed';
      task.error = 'Cancelled by user';
    }

    return true;
  }

  get(id: string): DownloadTask | undefined {
    return this.downloads.get(id);
  }

  list(): DownloadTask[] {
    return Array.from(this.downloads.values());
  }

  listActive(): DownloadTask[] {
    return this.list().filter(d => 
      d.status === 'downloading' || d.status === 'pending'
    );
  }

  private async verifyChecksum(filePath: string, expected: string): Promise<boolean> {
    return new Promise((resolve) => {
      const hash = createHash('sha256');
      const stream = require('fs').createReadStream(filePath);
      
      stream.on('data', (data: Buffer) => hash.update(data));
      stream.on('end', () => {
        const actual = hash.digest('hex');
        resolve(actual === expected);
      });
      stream.on('error', () => resolve(false));
    });
  }
}

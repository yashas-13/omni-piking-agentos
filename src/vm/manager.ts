import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

export interface VMDefinition {
  id: string;
  name: string;
  image: 'alpine' | 'ubuntu' | 'debian';
  status: VMStatus;
  cpuLimit: number;
  memoryLimit: string;
  diskLimit: string;
  createdAt: Date;
}

export type VMStatus = 'stopped' | 'running' | 'paused' | 'error';

export interface Snapshot {
  id: string;
  vmId: string;
  name: string;
  createdAt: Date;
}

export class VMManager extends EventEmitter {
  private vms: Map<string, VMDefinition> = new Map();
  private snapshots: Map<string, Snapshot> = new Map();

  create(name: string, image: VMDefinition['image']): VMDefinition {
    const vm: VMDefinition = {
      id: randomUUID(),
      name,
      image,
      status: 'stopped',
      cpuLimit: 2,
      memoryLimit: '2g',
      diskLimit: '20g',
      createdAt: new Date()
    };
    this.vms.set(vm.id, vm);
    this.emit('vmCreated', vm);
    return vm;
  }

  start(id: string): boolean {
    const vm = this.vms.get(id);
    if (!vm || vm.status === 'running') return false;
    vm.status = 'running';
    this.emit('vmStarted', vm);
    return true;
  }

  stop(id: string): boolean {
    const vm = this.vms.get(id);
    if (!vm || vm.status === 'stopped') return false;
    vm.status = 'stopped';
    this.emit('vmStopped', vm);
    return true;
  }

  snapshot(id: string, name: string): Snapshot | undefined {
    const vm = this.vms.get(id);
    if (!vm) return undefined;
    const snap: Snapshot = { id: randomUUID(), vmId: id, name, createdAt: new Date() };
    this.snapshots.set(snap.id, snap);
    this.emit('snapshotCreated', snap);
    return snap;
  }

  restore(snapshotId: string): boolean {
    const snap = this.snapshots.get(snapshotId);
    if (!snap) return false;
    this.emit('snapshotRestored', snap);
    return true;
  }

  list(): VMDefinition[] {
    return Array.from(this.vms.values());
  }

  listSnapshots(vmId?: string): Snapshot[] {
    const all = Array.from(this.snapshots.values());
    return vmId ? all.filter(s => s.vmId === vmId) : all;
  }

  delete(id: string): boolean {
    return this.vms.delete(id);
  }
}

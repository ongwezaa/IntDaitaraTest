declare module 'archiver' {
  import { Readable, Writable } from 'node:stream';

  interface ArchiveOptions {
    zlib?: {
      level?: number;
    };
  }

  interface AppendOptions {
    name: string;
  }

  interface Archiver extends NodeJS.EventEmitter {
    append(source: Readable | Buffer | string, data: AppendOptions): this;
    finalize(): Promise<void>;
    abort(): void;
    pipe(stream: Writable): Writable;
    on(event: 'error', callback: (error: Error) => void): this;
  }

  export default function archiver(format: string, options?: ArchiveOptions): Archiver;
}

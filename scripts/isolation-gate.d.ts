export type IsolationGateResult =
  | { status: 'pass'; raw: unknown }
  | { status: 'fail'; failures: string[]; raw: unknown }
  | { status: 'unverified'; reason: string };

export declare function runIsolationGate(): Promise<IsolationGateResult>;

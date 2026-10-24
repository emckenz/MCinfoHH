export class DeviceError extends Error {
  constructor(
    message: string,
    readonly code: 'unsupported' | 'offline' | 'auth' | 'protocol' | 'timeout' | 'rejected' | 'unavailable',
  ) {
    super(message);
    this.name = 'DeviceError';
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Erreur inconnue';
}

export class RevisionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class RevisionActorRequiredError extends RevisionError {}

export class RevisionNotFoundError extends RevisionError {}

export class RevisionConflictError extends RevisionError {
  constructor(
    message: string,
    public readonly revisionIds: readonly string[],
    public readonly conflictIds: readonly string[],
  ) {
    super(message)
  }
}

export class RevisionCheckpointError extends RevisionError {}

export class RevisionOverlapError extends RevisionError {}

export class RevisionUnsupportedOperationError extends RevisionError {}

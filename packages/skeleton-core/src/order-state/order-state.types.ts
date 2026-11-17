import { RequestStatus } from "@prisma/client";

export { RequestStatus };

export class InvalidOrderTransitionError extends Error {
  readonly current: RequestStatus;
  readonly next: RequestStatus;

  constructor(current: RequestStatus, next: RequestStatus) {
    super(
      `Invalid order transition: ${current} → ${next}`
    );
    this.name = "InvalidOrderTransitionError";
    this.current = current;
    this.next = next;
    // Restore prototype chain (required when extending built-in Error in TS)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

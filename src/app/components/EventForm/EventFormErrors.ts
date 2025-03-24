import { EventFormDataDto } from "@/lib/models/EventFormDto";

export enum EventFormErrors {
  TITLE = 1,
  HOURS = 2,
  DATE = 4,
  POOL = 8,
}

export const fieldIsInvalid = (
  error: EventFormErrors,
  input: number | string
): boolean => {
  switch (error) {
    case EventFormErrors.TITLE:
      return (input as string) === "";
    case EventFormErrors.HOURS:
      return (input as number) < 0;
    case EventFormErrors.DATE:
      return (input as string) === "";
    case EventFormErrors.POOL:
      return (input as number) <= 0;
    default:
      // TODO: Add logging here to track when this happens
      return false;
  }
};

export const eventFormIsValid = (event: EventFormDataDto): boolean =>
  !fieldIsInvalid(EventFormErrors.TITLE, event.title) &&
  !fieldIsInvalid(EventFormErrors.HOURS, event.hours) &&
  !fieldIsInvalid(EventFormErrors.DATE, event.date) &&
  !fieldIsInvalid(EventFormErrors.POOL, event.poolId);

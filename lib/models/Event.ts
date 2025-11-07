import dayjs, { Dayjs } from "dayjs";
import { PoolTransaction } from "./PoolTransaction";

export type Event = {
  // Unique identifier for this event
  id: number;
  // Title of the leave event
  title: string;
  // More detailed description of the event
  description: string;
  // Dates of when the hours are taken/when the event is taking place
  dates: Dayjs[];
  // Information about what pool and how many hours on what days are pulled for this event
  poolTransactions: PoolTransaction[];
};

type EventDtoOverrides = {
  dates: string[];
}

export type EventDto = Omit<Event, keyof EventDtoOverrides> & EventDtoOverrides;

export const serializeToEventDto = (event: Event): EventDto => ({
  ...event,
  dates: event.dates.map((date: Dayjs) => date.toJSON()),
});

export const deserializeToEvent = (event: EventDto): Event => ({
  ...event,
  dates: event.dates.map((date: string) => dayjs(date)),
});

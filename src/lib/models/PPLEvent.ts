import dayjs, { Dayjs } from "dayjs";
import { PPLEventDto } from "./PPLEventDto";

export type PPLEvent = {
  // Unique identifier for this event
  id: number;
  // Title of the PPL event
  title: string;
  // More detailed description of the event
  description: string;
  // Hours taken for the PPL event
  hours: number;
  // Date of when the hours are taken
  date: Dayjs;
  // ID of the PPL Pool that this event belongs to
  poolId: number;
};

export const deserializeToEvent = (event: PPLEventDto): PPLEvent => ({
  date: dayjs(event.date),
  description: event.description,
  hours: event.hours,
  id: event.id,
  poolId: event.poolId,
  title: event.title,
});

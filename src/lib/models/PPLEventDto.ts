import { PPLEvent } from "./PPLEvent";

export type PPLEventDto = {
  id: number;
  title: string;
  description: string;
  hours: number;
  date: string;
  poolId: number;
};

export const SerializeToEventDto = (event: PPLEvent): PPLEventDto => ({
  date: event.date.toJSON(),
  description: event.description,
  hours: event.hours,
  id: event.id,
  poolId: event.poolId,
  title: event.title,
});

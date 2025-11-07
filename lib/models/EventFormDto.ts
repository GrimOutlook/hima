import { EventDto } from "./Event";

export type EventFormDataDto = EventDto;

export const initialEventFormDataDto: EventFormDataDto = {
  date: "",
  description: "",
  hours: 0,
  id: 0,
  poolId: 0,
  title: "",
};

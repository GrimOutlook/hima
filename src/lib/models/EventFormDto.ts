import { PPLEventDto } from "./PPLEventDto";

export type EventFormDataDto = PPLEventDto;

export const initialEventFormDataDto: EventFormDataDto = {
  date: "",
  description: "",
  hours: 0,
  id: 0,
  poolId: 0,
  title: "",
};

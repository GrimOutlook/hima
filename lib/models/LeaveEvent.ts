import dayjs, { Dayjs } from "dayjs";
import { PoolTransaction, PoolTransactionDto, serializeToPoolTransactionDto, deserializeToPoolTransaction } from "./PoolTransaction";

export type LeaveEvent = {
  // Unique identifier for this event
  id?: number;
  // Title of the leave event
  title: string;
  // More detailed description of the event
  description?: string;
  // Dates of when the hours are taken/when the event is taking place
  dates: Dayjs[];
  // Information about what pool and how many hours on what days are pulled for this event
  poolTransactions: PoolTransaction[];
};

type LeaveEventDtoOverrides = {
  dates: string[];
  poolTransactions: PoolTransactionDto[];
}

export type LeaveEventDto = Omit<LeaveEvent, keyof LeaveEventDtoOverrides> & LeaveEventDtoOverrides;

export const serializeToLeaveEventDto = (event: LeaveEvent): LeaveEventDto => ({
  ...event,
  dates: event.dates.map((date: Dayjs) => date.toJSON()),
  poolTransactions: event.poolTransactions.map((t) => serializeToPoolTransactionDto(t))
});

export const deserializeToEvent = (event: LeaveEventDto): LeaveEvent => ({
  ...event,
  dates: event.dates.map((date: string) => dayjs(date)),
  poolTransactions: event.poolTransactions.map((t) => deserializeToPoolTransaction(t))
});

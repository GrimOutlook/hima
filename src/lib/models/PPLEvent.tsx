import dayjs, { Dayjs } from "dayjs";
import { PPLEventDto } from "./PPLEventDto";

type PPLEvent = {
    // Unique identifier for this event
    id: number
    // Title of the PPL event
    title: string;
    // More detailed description of the event
    description: string;
    // Hours taken for the PPL event
    hours: number;
    // Date of when the hours are taken
    date: Dayjs;
    // ID of the PPL Pool that this event belongs to
    pool: number;
}

export default PPLEvent;

export const DeserializeToEvent = (event: PPLEventDto): PPLEvent => ({
    id: event.id,
    title: event.title,
    description: event.description,
    hours: event.hours,
    date: dayjs(event.date),
    pool: event.pool,
})
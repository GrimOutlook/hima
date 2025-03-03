import PPLEvent from "./PPLEvent";

export type PPLEventDto = {
    id: number
    title: string;
    description: string;
    hours: number;
    date: string;
    pool: number;
}

export const SerializeToEventDto = (event: PPLEvent): PPLEventDto => ({
    id: event.id,
    title: event.title,
    description: event.description,
    hours: event.hours,
    date: event.date.toJSON(),
    pool: event.pool
})
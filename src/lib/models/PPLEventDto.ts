import {PPLEvent} from "./PPLEvent";

export type PPLEventDto = {
    id: number
    title: string;
    description: string;
    hours: number;
    date: string;
    pool_id: number;
}

export const SerializeToEventDto = (event: PPLEvent): PPLEventDto => ({
    id: event.id,
    title: event.title,
    description: event.description,
    hours: event.hours,
    date: event.date.toJSON(),
    pool_id: event.pool_id
})
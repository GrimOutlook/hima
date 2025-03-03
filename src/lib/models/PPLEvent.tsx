type PPLEvent = {
    // Title of the PPL event
    title: string;
    // More detailed description of the event
    description: string;
    // Hours taken for the PPL event
    hours: number;
    // Date of when the hours are taken
    date: Date;
    // PPL Pool that this event belongs to
    pool: string;
}
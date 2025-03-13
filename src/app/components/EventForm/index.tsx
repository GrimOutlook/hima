"use client";

import { Fieldset, Legend } from "@headlessui/react";
import { addEvent, selectNextEventID } from "@/lib/features/eventListSlice";
import {
  clearEventFormData,
  selectEventFormData,
  selectEventFormErrors,
  selectEventFormOpenState,
  setEventFormOpenState,
} from "@/lib/features/eventFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { EventDateField } from "./EventDateField";
import { EventDescriptionField } from "./EventDescriptionField";
import { EventHoursField } from "./EventHoursField";
import { EventPoolField } from "./EventPoolField";
import { EventSubmitButton } from "./EventSubmitButton";
import { EventTitleField } from "./EventTitleField";
import { OverlayDialog } from "../OverlayDialog";
import React from "react";

const EventForm: React.FC = () => {
  const dispatch = useAppDispatch();
  const eventFormOpenState = useAppSelector(selectEventFormOpenState);
  const eventFormData = useAppSelector(selectEventFormData);
  const errors = useAppSelector(selectEventFormErrors);
  const nextEventId = useAppSelector(selectNextEventID);

  const submit = () => {
    if (errors > 0) {
      return;
    }

    let data = eventFormData;
    if (data.id <= 0) {
      data = { ...eventFormData, id: nextEventId };
    }

    dispatch(addEvent(data));
    dispatch(clearEventFormData());
    dispatch(setEventFormOpenState(false));
  };

  return (
    <OverlayDialog
      onClose={() => dispatch(setEventFormOpenState(false))}
      show={eventFormOpenState}
    >
      <div className="bg-zinc-300 h-fit w-fit rounded-lg">
        <form>
          <Fieldset className={"p-6"}>
            <Legend className={"text-6xl"}>New PPL Event</Legend>
            <div className="w-full mt-4 flex">
              <EventTitleField />
              <EventHoursField />
            </div>
            <EventDescriptionField />
            <div className="mt-2 flex">
              <EventDateField />
              <EventPoolField />
            </div>
            <EventSubmitButton onClick={() => submit()} />
          </Fieldset>
        </form>
      </div>
    </OverlayDialog>
  );
};

export default EventForm;

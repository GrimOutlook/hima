"use client";

import { Fieldset, Legend } from "@headlessui/react";
import { addEvent, selectNextEventID } from "@/lib/features/eventListSlice";
import {
  clearEventFormData,
  selectEventFormData,
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
import React, { useState } from "react";
import { eventFormIsValid } from "./EventFormErrors";

export type EventFormFieldProps = {
  submitHasBeenClicked: boolean;
};

const EventForm = () => {
  const dispatch = useAppDispatch();
  const eventFormOpenState = useAppSelector(selectEventFormOpenState);
  const eventFormData = useAppSelector(selectEventFormData);
  const nextEventId = useAppSelector(selectNextEventID);
  const [submitHasBeenClicked, setSubmitHasBeenClicked] = useState(false);

    const close = () => {
      dispatch(clearEventFormData());
      dispatch(setEventFormOpenState(false));
      setSubmitHasBeenClicked(false);
    };

    const submit = () => {
      setSubmitHasBeenClicked(true);
      if (!eventFormIsValid(eventFormData)) {
        return;
      }

      let data = eventFormData;
      if (data.id <= 0) {
        data = { ...eventFormData, id: nextEventId };
      }

      dispatch(addEvent(data));
      close();
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
              <EventTitleField submitHasBeenClicked={submitHasBeenClicked} />
              <EventHoursField submitHasBeenClicked={submitHasBeenClicked} />
            </div>
            <EventDescriptionField />
            <div className="mt-2 flex">
              <EventDateField submitHasBeenClicked={submitHasBeenClicked} />
              <EventPoolField submitHasBeenClicked={submitHasBeenClicked} />
            </div>
            <EventSubmitButton onClick={() => submit()} />
          </Fieldset>
        </form>
      </div>
    </OverlayDialog>
  );
};

export default EventForm;

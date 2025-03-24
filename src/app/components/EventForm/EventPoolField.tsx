import { EventFormErrors, fieldIsInvalid } from "./EventFormErrors";
import { Field, Label, Listbox } from "@headlessui/react";
import React, { useState } from "react";
import {
  selectEventFormData,
  setEventFormData,
} from "@/lib/features/eventFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { EventFormFieldProps } from ".";
import { EventPoolListButton } from "./EventPoolListButton";
import { EventPoolListOptions } from "./EventPoolListOptions";

const FIELD = EventFormErrors.POOL;

export const EventPoolField: React.FC<EventFormFieldProps> = ({
  submitHasBeenClicked,
}) => {
  const dispatch = useAppDispatch();
  const eventFormData = useAppSelector(selectEventFormData);
  const [isInvalid, setIsInvalid] = useState(false);
  const [optionsListIsFocused, setOptionsListIsFocused] = useState(false);
  const [hasBeenFocused, setHasBeenFocused] = useState(false);

  const handleChange = (period: number) => {
    setIsInvalid(fieldIsInvalid(FIELD, period));

    const data = { ...eventFormData, period };
    dispatch(setEventFormData(data));
  };


  const showError =
      (isInvalid && (hasBeenFocused && optionsListIsFocused !== true)) ||
      (submitHasBeenClicked && fieldIsInvalid(FIELD, eventFormData.poolId));

  return (
    <Field>
      <Label className={"block text-3xl"}>Pool</Label>
      <Listbox
        value={eventFormData.poolId}
        onChange={(event) => handleChange(event)}
      >
        <EventPoolListButton
          showError={showError}
          onBlur={() => {
            setIsInvalid(fieldIsInvalid(FIELD, eventFormData.poolId));
          }}
          onFocus={() => {
            setOptionsListIsFocused(false);
            setHasBeenFocused(true);
            setIsInvalid(false);
          }}
        />
        <EventPoolListOptions onFocus={() => setOptionsListIsFocused(true)} />
      </Listbox>
    </Field>
  );
};

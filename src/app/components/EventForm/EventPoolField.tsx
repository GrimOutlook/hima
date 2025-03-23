import { Field, Label, Listbox } from "@headlessui/react";
import {
  selectEventFormData,
  setEventFormData,
} from "@/lib/features/eventFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { EventFormErrors, fieldIsValid } from "./EventFormErrors";
import { EventPoolListButton } from "./EventPoolListButton";
import { EventPoolListOptions } from "./EventPoolListOptions";
import { useState } from "react";
import { EventFormFieldProps } from ".";

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
    setIsInvalid(!fieldIsValid(FIELD, period));

    const data = { ...eventFormData, period };
    dispatch(setEventFormData(data));
  };

  const showError =
    isInvalid &&
    (submitHasBeenClicked || (hasBeenFocused && optionsListIsFocused !== true));

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
            setIsInvalid(!fieldIsValid(FIELD, eventFormData.poolId));
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

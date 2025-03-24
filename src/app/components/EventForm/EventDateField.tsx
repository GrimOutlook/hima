import { Field, Input, Label } from "@headlessui/react";
import {
  selectEventFormData,
  setEventFormData,
} from "@/lib/features/eventFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { EventFormErrors, fieldIsInvalid } from "./EventFormErrors";
import { GradientFocusInput } from "../GradientFocusInput";
import React, { useState } from "react";
import { EventFormFieldProps } from ".";

const FIELD = EventFormErrors.DATE;

// eslint-disable-next-line max-lines-per-function
export const EventDateField: React.FC<EventFormFieldProps> = ({
  submitHasBeenClicked,
}) => {
  const dispatch = useAppDispatch();
  const eventFormData = useAppSelector(selectEventFormData);
  const [isInvalid, setIsInvalid] = useState(false);
  const [hasBeenFocused, setHasBeenFocused] = useState(false);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const data = { ...eventFormData, date: event.target.value };
    dispatch(setEventFormData(data));
  };

  const showError =
      (isInvalid && hasBeenFocused) ||
      (submitHasBeenClicked && fieldIsInvalid(FIELD, eventFormData.date));

  return (
    <Field className="mr-4">
      <Label className={"text-3xl block"}>Date Taken</Label>
      <GradientFocusInput
        invalid={showError}
        className="w-40 h-10"
        focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
        unfocusedClassName="bg-zinc-300"
      >
        <Input
          name="date"
          type="date"
          value={eventFormData.date}
          onFocus={() => {
            setHasBeenFocused(true);
            setIsInvalid(false);
          }}
          onBlur={() =>
            setIsInvalid(fieldIsInvalid(FIELD, eventFormData.date))
          }
          onChange={(event) => handleChange(event)}
          className={showError ? "border-red-500" : ""}
        />
      </GradientFocusInput>
    </Field>
  );
};

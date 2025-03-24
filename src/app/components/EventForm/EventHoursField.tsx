import { EventFormErrors, fieldIsInvalid } from "./EventFormErrors";
import { Field, Input, Label } from "@headlessui/react";
import React, { useState } from "react";
import {
  selectEventFormData,
  setEventFormData,
} from "@/lib/features/eventFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { EventFormFieldProps } from ".";
import { GradientFocusInput } from "../GradientFocusInput";

const FIELD = EventFormErrors.HOURS;

export const EventHoursField: React.FC<EventFormFieldProps> = ({
  submitHasBeenClicked,
}) => {
  const dispatch = useAppDispatch();
  const eventFormData = useAppSelector(selectEventFormData);
  const [isInvalid, setIsInvalid] = useState(false);
  const [hasBeenFocused, setHasBeenFocused] = useState(false);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const num = Number(event.target.value);
    const data = { ...eventFormData, amount: num };
    dispatch(setEventFormData(data));
  };

  const showError =
      (isInvalid && hasBeenFocused) ||
      (submitHasBeenClicked && fieldIsInvalid(FIELD, eventFormData.hours));

  return (
    <Field>
      <Label className={"block text-3xl"}>Hours</Label>
      <GradientFocusInput
        invalid={showError}
        className="w-20 h-10 mr-1"
        focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
        unfocusedClassName="bg-zinc-300"
      >
        <Input
          name="hours"
          value={eventFormData.hours}
          onBlur={() =>
            setIsInvalid(fieldIsInvalid(FIELD, eventFormData.hours))}
          onChange={(event) => handleChange(event)}
          onFocus={() => {
            setHasBeenFocused(true);
            setIsInvalid(false);
          }}
          className={showError ? "border-red-500" : ""}
        />
      </GradientFocusInput>
    </Field>
  );
};

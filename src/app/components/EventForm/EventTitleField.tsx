import { Field, Input, Label } from "@headlessui/react";
import {
  selectEventFormData,
  setEventFormData,
} from "@/lib/features/eventFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { EventFormErrors, fieldIsValid } from "./EventFormErrors";
import { GradientFocusInput } from "../GradientFocusInput";
import React, { useState } from "react";
import { EventFormFieldProps } from ".";

const FIELD = EventFormErrors.TITLE;

export const EventTitleField: React.FC<EventFormFieldProps> = ({
  submitHasBeenClicked}) => {
  const dispatch = useAppDispatch();
  const eventFormData = useAppSelector(selectEventFormData);
  const [isInvalid, setIsInvalid] = useState(false);
  const [hasBeenFocused, setHasBeenFocused] = useState(false);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const data = { ...eventFormData, name: event.target.value };
    dispatch(setEventFormData(data));
  };

  const showError = isInvalid && (hasBeenFocused || submitHasBeenClicked);

  return (
    <Field className={"mr-4"}>
      <Label className={"block text-3xl"}>Title</Label>
      <GradientFocusInput
        invalid={showError}
        className="w-60 h-10"
        focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
        unfocusedClassName="bg-zinc-300"
      >
        <Input
          autoFocus
          name="title"
          value={eventFormData.title}
          onBlur={() => setIsInvalid(!fieldIsValid(FIELD, eventFormData.title))}
          onChange={(event) => handleChange(event)}
          onFocus={() => {
            setHasBeenFocused(true);
            setIsInvalid(false);
          }}
          className={isInvalid ? "border-red-500" : ""}
        />
      </GradientFocusInput>
    </Field>
  );
};

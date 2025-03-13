import { Field, Input, Label } from "@headlessui/react";
import {
  selectEventFormData,
  selectEventFormErrors,
  setEventFormData,
  setEventFormErrors,
} from "@/lib/features/eventFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { EventFormErrors } from "./EventFormErrors";
import { GradientFocusInput } from "../GradientFocusInput";
import React from "react";

const FIELD = EventFormErrors.TITLE;

// eslint-disable-next-line max-lines-per-function
export const EventTitleField = () => {
  const dispatch = useAppDispatch();
  const eventFormData = useAppSelector(selectEventFormData);
  const errors = useAppSelector(selectEventFormErrors);

  const validate = () => {
    // eslint-disable-next-line init-declarations
    let newErrors;

    if (eventFormData.title === "") {
      // eslint-disable-next-line no-bitwise
      newErrors = errors | FIELD;
    } else {
      // eslint-disable-next-line no-bitwise
      newErrors = errors | ~FIELD;
    }

    dispatch(setEventFormErrors(newErrors));
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const data = { ...eventFormData, title: event.target.value };
    dispatch(setEventFormData(data));
    validate();
  };

  // eslint-disable-next-line no-bitwise
  const isInvalid = (errors & FIELD) > 0;

  return (
    <Field className={"mr-4"}>
      <Label className={"block text-3xl"}>Title</Label>
      <GradientFocusInput
        className="w-60 h-10"
        focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
        unfocusedClassName="bg-zinc-300"
      >
        <Input
          autoFocus
          name="title"
          value={eventFormData.title}
          onBlur={() => validate()}
          onChange={(event) => handleChange(event)}
          onClick={() =>
            // eslint-disable-next-line no-bitwise
            dispatch(setEventFormErrors(errors & ~FIELD))
          }
          className={isInvalid ? "border-red-500" : ""}
        />
      </GradientFocusInput>
    </Field>
  );
};

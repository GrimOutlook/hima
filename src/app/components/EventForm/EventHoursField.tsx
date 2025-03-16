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

const FIELD = EventFormErrors.HOURS;

// eslint-disable-next-line max-lines-per-function
export const EventHoursField = () => {
  const dispatch = useAppDispatch();
  const eventFormData = useAppSelector(selectEventFormData);
  const errors = useAppSelector(selectEventFormErrors);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const num = Number(event.target.value);
    const data = { ...eventFormData, hours: num };
    dispatch(setEventFormData(data));
  };

  const validate = () => {
    // eslint-disable-next-line init-declarations
    let newErrors;

    if (eventFormData.hours === 0) {
      // eslint-disable-next-line no-bitwise
      newErrors = errors | FIELD;
    } else {
      // eslint-disable-next-line no-bitwise
      newErrors = errors | ~FIELD;
    }

    dispatch(setEventFormErrors(newErrors));
  };

  // eslint-disable-next-line no-bitwise
  const isInvalid = (errors & FIELD) > 0;

  return (
    <Field>
      <Label className={"block text-3xl"}>Hours</Label>
      <GradientFocusInput
        className="w-20 h-10 mr-1"
        focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
        unfocusedClassName="bg-zinc-300"
      >
        <Input
          name="hours"
          value={eventFormData.hours}
          onBlur={() => validate()}
          onChange={(event) => handleChange(event)}
          onFocus={() =>
            // eslint-disable-next-line no-bitwise
            dispatch(setEventFormErrors(errors & ~FIELD))
          }
          className={isInvalid ? "border-red-500" : ""}
        />
      </GradientFocusInput>
    </Field>
  );
};

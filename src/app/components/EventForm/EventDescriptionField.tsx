import { Field, Label, Textarea } from "@headlessui/react";
import {
  selectEventFormData,
  setEventFormData,
} from "@/lib/features/eventFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { GradientFocusInput } from "../GradientFocusInput";
import React from "react";

export const EventDescriptionField = () => {
  const dispatch = useAppDispatch();
  const eventFormData = useAppSelector(selectEventFormData);

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const data = { ...eventFormData, description: event.target.value };
    dispatch(setEventFormData(data));
  };

  return (
    <Field className={"mt-2"}>
      <Label className={"block text-3xl"}>Description</Label>
      <GradientFocusInput
        className="w-80 h-20"
        focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
        unfocusedClassName="bg-zinc-300"
      >
        <Textarea
          name={"description"}
          value={eventFormData.description}
          onChange={(event) => handleChange(event)}
        />
      </GradientFocusInput>
    </Field>
  );
};

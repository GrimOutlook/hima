import { Field, Label, Textarea } from "@headlessui/react";
import {
  selectPoolFormDataState,
  setPoolFormData,
} from "@/lib/features/poolFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { GradientFocusInput } from "../GradientFocusInput";
import React from "react";

export const PoolDescriptionField = () => {
  const dispatch = useAppDispatch();
  const poolFormData = useAppSelector(selectPoolFormDataState);

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    // No validation required for description
    const data = { ...poolFormData, description: event.target.value };
    dispatch(setPoolFormData(data));
  };

  return (
    <>
      <Field>
        <Label className={"block text-3xl"}>Description</Label>
        <GradientFocusInput
          className="w-60 h-auto"
          focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
          unfocusedClassName="bg-zinc-300"
        >
          <Textarea
            name="description"
            value={poolFormData.description}
            onChange={(event) => handleChange(event)}
          />
        </GradientFocusInput>
      </Field>
    </>
  );
};

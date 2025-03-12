import { Field, Input, Label } from "@headlessui/react";
import {
  selectPoolFormDataState,
  selectPoolFormErrorsState,
  setPoolFormData,
  setPoolFormErrors,
} from "@/lib/features/poolFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { GradientFocusInput } from "../GradientFocusInput";
import { PoolFormErrors } from "./PoolFormErrors";
import React from "react";

export const PoolNameField = () => {
  const dispatch = useAppDispatch();
  const poolFormData = useAppSelector(selectPoolFormDataState);
  const errors = useAppSelector(selectPoolFormErrorsState);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const data = { ...poolFormData, name: event.target.value };
    dispatch(setPoolFormData(data));
  };

  const handleSubmit = () => {
    // eslint-disable-next-line init-declarations
    let newErrors;

    if (poolFormData.name === "") {
      // eslint-disable-next-line no-bitwise
      newErrors = errors | PoolFormErrors.NAME;
    } else {
      // eslint-disable-next-line no-bitwise
      newErrors = errors | ~PoolFormErrors.NAME;
    }

    dispatch(setPoolFormErrors(newErrors));
  };

  // eslint-disable-next-line no-bitwise
  const isInvalid = (errors & PoolFormErrors.NAME) > 0;

  return (
    <Field>
      <Label className={"block text-3xl"}>Pool Name</Label>
      <GradientFocusInput
        invalid={isInvalid}
        className="h-10 w-60"
        focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
        unfocusedClassName="bg-zinc-300"
      >
        <Input
          autoFocus
          name="name"
          value={poolFormData.name}
          onBlur={() => handleSubmit()}
          onChange={(event) => handleChange(event)}
          className={isInvalid ? "border-red-500" : ""}
        />
      </GradientFocusInput>
    </Field>
  );
};

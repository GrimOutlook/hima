import { Field, Input, Label } from "@headlessui/react";
import {
  selectPoolFormData,
  selectPoolFormErrors,
  setPoolFormData,
  setPoolFormErrors,
} from "@/lib/features/poolFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { GradientFocusInput } from "../GradientFocusInput";
import { PoolFormErrors } from "./PoolFormErrors";
import React from "react";

const FIELD = PoolFormErrors.NAME;

// eslint-disable-next-line max-lines-per-function
export const PoolNameField = () => {
  const dispatch = useAppDispatch();
  const poolFormData = useAppSelector(selectPoolFormData);
  const errors = useAppSelector(selectPoolFormErrors);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const data = { ...poolFormData, name: event.target.value };
    dispatch(setPoolFormData(data));
  };

  const validate = () => {
    // eslint-disable-next-line init-declarations
    let newErrors;

    if (poolFormData.name === "") {
      // eslint-disable-next-line no-bitwise
      newErrors = errors | FIELD;
    } else {
      // eslint-disable-next-line no-bitwise
      newErrors = errors | ~FIELD;
    }

    dispatch(setPoolFormErrors(newErrors));
  };

  // eslint-disable-next-line no-bitwise
  const isInvalid = (errors & FIELD) > 0;

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
          onBlur={() => validate()}
          onChange={(event) => handleChange(event)}
          onClick={() =>
            // eslint-disable-next-line no-bitwise
            dispatch(setPoolFormErrors(errors & ~FIELD))
          }
          className={isInvalid ? "border-red-500" : ""}
        />
      </GradientFocusInput>
    </Field>
  );
};

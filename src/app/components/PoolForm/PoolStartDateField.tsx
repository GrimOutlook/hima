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

// eslint-disable-next-line max-lines-per-function
export const PoolStartDateField = () => {
  const dispatch = useAppDispatch();
  const poolFormData = useAppSelector(selectPoolFormDataState);
  const errors = useAppSelector(selectPoolFormErrorsState);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const data = { ...poolFormData, startDate: event.target.value };
    dispatch(setPoolFormData(data));
  };

  const validate = () => {
    // eslint-disable-next-line init-declarations
    let newErrors;

    if (poolFormData.startDate === "") {
      // eslint-disable-next-line no-bitwise
      newErrors = errors | PoolFormErrors.START_DATE;
    } else {
      // eslint-disable-next-line no-bitwise
      newErrors = errors | ~PoolFormErrors.START_DATE;
    }

    dispatch(setPoolFormErrors(newErrors));
  };

  // eslint-disable-next-line no-bitwise
  const isInvalid = (errors & PoolFormErrors.START_DATE) > 0;

  return (
    <Field className={"mt-2"}>
      <Label className={"text-3xl block"}>Starting on</Label>
      <GradientFocusInput
        invalid={isInvalid}
        className="h-10 w-auto mr-1 inline-block"
        focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
        unfocusedClassName="bg-zinc-300"
      >
        <Input
          name="startDate"
          type="date"
          onClick={() =>
            // eslint-disable-next-line no-bitwise
            dispatch(setPoolFormErrors(errors & ~PoolFormErrors.START_DATE))
          }
          value={poolFormData.startDate}
          onBlur={() => validate()}
          onChange={(event) => handleChange(event)}
          className={isInvalid ? "border-red-500" : ""}
        />
      </GradientFocusInput>
    </Field>
  );
};

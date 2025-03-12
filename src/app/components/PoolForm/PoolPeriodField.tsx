import { Field, Listbox } from "@headlessui/react";
import {
  selectPoolFormDataState,
  selectPoolFormErrorsState,
  setPoolFormData,
  setPoolFormErrors,
} from "@/lib/features/poolFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { PoolFormErrors } from "./PoolFormErrors";
import { PoolPeriodListButton } from "./PoolPeriodListButton";
import { PoolPeriodListOptions } from "./PoolPeriodListOptions";

export const PoolPeriodField = () => {
  const dispatch = useAppDispatch();
  const poolFormData = useAppSelector(selectPoolFormDataState);
  const errors = useAppSelector(selectPoolFormErrorsState);

  const validate = (value: string) => {
    // eslint-disable-next-line init-declarations
    let newErrors;

    if (value === "") {
      // eslint-disable-next-line no-bitwise
      newErrors = errors | PoolFormErrors.PERIOD;
    } else {
      // eslint-disable-next-line no-bitwise
      newErrors = errors | ~PoolFormErrors.PERIOD;
    }

    dispatch(setPoolFormErrors(newErrors));
  };

  const handleChange = (period: string) => {
    validate(period);

    const data = { ...poolFormData, period };
    dispatch(setPoolFormData(data));
  };

  return (
    <Field className={"inline"}>
      <Listbox
        value={poolFormData.period}
        onChange={(event) => handleChange(event)}
      >
        <PoolPeriodListButton />
        <PoolPeriodListOptions />
      </Listbox>
    </Field>
  );
};

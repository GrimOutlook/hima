import { Field, Listbox } from "@headlessui/react";
import { PoolFormErrors, fieldIsValid } from "./PoolFormErrors";
import {
  selectPoolFormData,
  selectPoolFormErrors,
  setPoolFormData,
  setPoolFormErrors,
} from "@/lib/features/poolFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { PoolPeriodListButton } from "./PoolPeriodListButton";
import { PoolPeriodListOptions } from "./PoolPeriodListOptions";

const FIELD = PoolFormErrors.PERIOD;

export const PoolPeriodField = () => {
  const dispatch = useAppDispatch();
  const poolFormData = useAppSelector(selectPoolFormData);
  const errors = useAppSelector(selectPoolFormErrors);

  const validate = (period: string) => {
    /* eslint-disable no-bitwise */
    const newErrors = fieldIsValid(FIELD, period)
      ? errors | ~FIELD
      : errors | FIELD;
    /* eslint-enable no-bitwise */

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

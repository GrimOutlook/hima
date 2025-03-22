import {
  closeAlertDialog,
  selectAlertDialogState,
} from "@/lib/features/alertDialogSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import React from "react";
import { setTimeout } from "timers";
import styles from "@/styles/alert.module.css";

const SEC_IN_MS = 1000;
const NO_DELAY = 0;
const ANIMATION_TIME = 300;

const Alert: React.FC = () => {
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectAlertDialogState);
  const [isClosing, setIsClosing] = React.useState(false);

  const close = () => {
    setIsClosing(true);
    setTimeout(() => {
      dispatch(closeAlertDialog());
      setTimeout(() => {
        setIsClosing(false);
      }, NO_DELAY);
    }, ANIMATION_TIME);
  };

  if (!state.open) {
    return <></>;
  }

  setTimeout(() => {
    if (state.open && !isClosing) {
      close();
    }
  }, state.timeout * SEC_IN_MS);

  return (
    <>
      <div
        className={`${styles.alert_motion} ${(isClosing && styles.alert_closing) || ""} bg-red-200/80 m-5 rounded-lg absolute z-10 top-0 right-0 shadow-lg p-4 select-none`}
        onClick={() => dispatch(closeAlertDialog())}
      >
        <div className="text-xl font-bold">{state.title}</div>
        {state.message}
      </div>
    </>
  );
};

export default Alert;

import { closeAlertDialog, selectAlertDialogState } from '@/lib/features/alertDialogSlice';
import { useAppDispatch, useAppSelector } from '../../lib/hooks';
import styles from './alert.module.css';
import React from 'react';

const Alert: React.FC = () => {
    const dispatch = useAppDispatch();
    const state = useAppSelector(selectAlertDialogState)
    const [isClosing, setIsClosing] = React.useState(false);

    const close = () => {   
        setIsClosing(true);
        setTimeout(() => {
            dispatch(closeAlertDialog());
        }, 300);
    }

    if (!state.open) {
        return (<></>);
    }

    setTimeout(() => {
        if (state.open && ~isClosing) {
            close()
        }
    }, state.timeout * 1000);

    return (
        <>
            <div className={`${styles.alert_motion} ${isClosing ? styles.alert_closing : ""} bg-red-200/80 m-5 rounded-lg absolute z-10 top-0 right-0 shadow-lg p-4 select-none`}
            onClick={() => dispatch(closeAlertDialog())}>
                <div className='text-xl font-bold'>{state.title}</div>
                {state.message}
            </div>
        </>
    );
};

export default Alert;
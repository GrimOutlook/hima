import { closePoolDialog, selectPoolDialogOpenState } from "@/lib/features/poolDialogSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { Dialog, Transition, TransitionChild } from "@headlessui/react";
import { Fragment } from "react";
import PoolForm from "./pool_form";


type AddPoolDialogProps = {
    className?: string;
}

const AddPoolDialog: React.FC<AddPoolDialogProps> = ({className}) => {
    const dispatch = useAppDispatch();
    const poolDialogOpenState = useAppSelector(selectPoolDialogOpenState);
    
    return (
        <Transition appear show={poolDialogOpenState} as={Fragment}>
        <Dialog 
        open={poolDialogOpenState}
        onClose={() => dispatch(closePoolDialog())}
        as="div" className="relative z-10">
            
        <TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
        >
            <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => dispatch(closePoolDialog())} />
        </TransitionChild>

        <div className="fixed inset-0 self-center justify-self-center">
            <PoolForm/>
        </div>
        </Dialog>
        </Transition>
    )
}

export default AddPoolDialog
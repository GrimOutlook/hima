import { Dialog, Label, Transition, TransitionChild } from "@headlessui/react"


import { Fragment, JSX } from "react";


type DetailsOverlayProps = {
    children?: string | JSX.Element | JSX.Element[];
    show?: boolean;
    onClose: (value: any) => void;
    position: {x: number, y: number};
}


export const DetailsOverlay: React.FC<DetailsOverlayProps> = ({onClose, show, children, position}) => {
    var position_string = "top-0 left-0"
    if (show) {
        position_string = `bottom-[${position.y.toString()}px] right-[${position.x.toString()}px]`
        console.log(`Position string = ${position_string}`)
    }
    return (
        <Transition appear show={show} as={Fragment}>
            <Dialog 
            open={show}
            onClose={onClose}
            as="div" className={`absolute top-[447px] left-[89px] bg-green-500 size-32 z-10`}>
                
                <TransitionChild
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className={``}>
                        {children}
                    </div>
                </TransitionChild>
            </Dialog>
        </Transition>
    )
}
import { Label } from "@headlessui/react"
import { DetailsOverlay } from "./details_overlay"
import { closePoolDetailsOverlay, selectPoolDetailsOverlayOpenState } from "@/lib/features/poolDetailsOverlaySlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { selectMousePosition } from "@/lib/features/trackMouse";

export const PoolDetailsOverlay = () => {
    const dispatch = useAppDispatch();
    const open = useAppSelector(selectPoolDetailsOverlayOpenState);
    const mousePosition = useAppSelector(selectMousePosition)

    return (
        <DetailsOverlay position={mousePosition} show={open} onClose={() => dispatch(closePoolDetailsOverlay())}>
            <div className="size-32 bg-red-500"/>
        </DetailsOverlay>
    )
}
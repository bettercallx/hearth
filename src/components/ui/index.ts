/**
 * UI primitives — correct-by-default, built on Base UI (@base-ui/react) and
 * styled entirely with the app's semantic theme tokens. Only the pieces the
 * app uses are kept.
 */

/* Form */
export { Button, buttonVariants } from './Button'
export { Input } from './Input'
export { Textarea } from './Textarea'
export { Select, SelectValue, SelectTrigger, SelectContent, SelectItem } from './Select'
export { Label } from './Label'

/* Data display */
export { Avatar, AvatarImage, AvatarFallback } from './Avatar'

/* Feedback */
export { ToastProvider, useToast } from './Toast'

/* Overlay */
export { Modal, ConfirmModal } from './Modal'
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from './DropdownMenu'
export { Popover, PopoverTrigger, PopoverContent } from './Popover'

import { styled } from '@mui/material/styles'
import type React from 'react'
import { theme } from './theme'

const PREFIX = 'ErrorMessage'

const classes = {
  root: `${PREFIX}-root`
}

const Root = styled('div')(() => ({
  [`&.${classes.root}`]: {
    color: theme.palette.error.main,
    marginTop: (props: Props) => props.marginTop,
    marginBottom: (props: Props) => props.marginBottom
  }
}))

interface Props {
  error: string
  message?: string
  context?: string
  marginTop?: number
  marginBottom?: number
}

const getMessage = ({ message, context }: Props) => {
  if (message) {
    return message
  }

  if (context) {
    return `Error occurred (${context}).`
  }

  return 'Error occurred.'
}

export const ErrorMessage: React.FunctionComponent<Props> = (props: Props) => {
  const message = getMessage(props)

  return (
    // role="alert" makes the error interrupt the screen reader so it is announced when it
    // appears, rather than only being found by manually arrowing over the page.
    <Root className={classes.root} role="alert" data-testid="error-message">
      {message}
    </Root>
  )
}

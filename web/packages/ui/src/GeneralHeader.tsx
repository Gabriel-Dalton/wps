import { styled } from '@mui/material/styles'
import React from 'react'
import { OptionalContainer } from './Container'
import FeedbackButton from './FeedbackButton'
import HeaderImage from './HeaderImage'

const PREFIX = 'GeneralHeader'

const classes = {
  beta: `${PREFIX}-beta`,
  root: `${PREFIX}-root`,
  container: `${PREFIX}-container`,
  title: `${PREFIX}-title`,
  titleWrapper: `${PREFIX}-titleWrapper`
}

const Root = styled('nav')(({ theme }) => ({
  [`& .${classes.beta}`]: {
    alignSelf: 'flex-start',
    color: theme.palette.secondary.main,
    fontSize: '1.25em',
    fontWeight: 'bold',
    paddingLeft: theme.spacing(1),
    paddingTop: theme.spacing(2)
  },

  [`&.${classes.root}`]: {
    background: theme.palette.primary.main,
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
    borderBottomColor: theme.palette.secondary.main,
    zIndex: theme.zIndex.drawer + 1
  },

  [`& .${classes.container}`]: {
    display: 'flex',
    alignItems: 'center',
    maxWidth: '100%'
  },

  [`& .${classes.title}`]: {
    color: theme.palette.primary.contrastText,
    fontSize: '1.7rem',
    // Rendered as an <h1> for screen reader heading navigation; reset the UA heading styles
    // so the visual appearance is unchanged.
    fontWeight: 'normal',
    margin: 0
  },

  [`& .${classes.titleWrapper}`]: {
    display: 'flex',
    alignItems: 'center'
  }
}))

interface Props {
  isBeta: boolean
  padding?: string
  spacing: number
  title: string
}

export const GeneralHeader = React.forwardRef<HTMLDivElement, Props>((props, ref) => {
  const { title, spacing } = props
  GeneralHeader.displayName = 'GeneralHeader'

  return (
    <Root ref={ref} className={classes.root}>
      <OptionalContainer className={classes.container}>
        <div className={classes.titleWrapper}>
          <HeaderImage />
          {/* Each tool page needs exactly one level-1 heading so screen reader users can
              orient themselves via the rotor / elements list. */}
          <h1 className={classes.title}>{title}</h1>
          {props.isBeta && <div className={classes.beta}>BETA</div>}
        </div>
        <div style={{ flexGrow: spacing }}></div>
        <FeedbackButton color="inherit" />
      </OptionalContainer>
    </Root>
  )
})

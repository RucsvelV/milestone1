import React, { FC, useCallback } from 'react'
import { useTheme } from 'styled-components'
import { useCharacterContractWeb3, useModal } from 'hooks'
import { useAppSelector, useAppDispatch } from 'state/hooks'
import { MODAL } from 'providers'
import { fetchIsBattleStarted } from 'state/actions/battleActions'

import { StyledModal } from './styles'
import { ModalProps } from '../../modal'
import Text from '../../text/text'
import Button from '../../button/Button'
import { AwardModalButton } from '../awardModal/styles'
import { parseTxError, TxError } from 'helpers/parseTxError'
import { ITxResultModalProps } from '../txResultModal'
import { useSDK } from 'sdk'

export const FinishSearchModal: FC<ModalProps> = (props) => {
  const { onClose: closeFinishSearchModal } = props

  const dispatch = useAppDispatch()
  const { account } = useSDK()
  const tokenId = useAppSelector(
    (store) => store.user.nftInfo.selectedCharacter.id,
  )
  const theme = useTheme()
  const characterWeb3 = useCharacterContractWeb3()
  const { openModal: openProcessingModal } = useModal(MODAL.processing)
  const { openModal: openResultModal } = useModal(MODAL.result)

  const handleSearchFinish = useCallback(async () => {
    try {
      if (characterWeb3 && tokenId && closeFinishSearchModal) {
        openProcessingModal({
          message: 'Unlocking account',
          needLoader: true,
        })

        const changeLockTx = await characterWeb3.changeLock(tokenId, false)
        await changeLockTx.wait()

        dispatch(
          fetchIsBattleStarted({ instanceRPC: characterWeb3, user: account }),
        )

        closeFinishSearchModal()

        openResultModal({
          status: 'Success',
          message: 'You unlocked your account!',
        } as ITxResultModalProps)
      }
    } catch (e) {
      openResultModal({
        status: 'Error',
        message: parseTxError(e as TxError),
      } as ITxResultModalProps)
      console.log(e)
    }
  }, [
    characterWeb3,
    tokenId,
    closeFinishSearchModal,
    openResultModal,
    openProcessingModal,
    dispatch,
    account,
  ])

  return (
    <StyledModal {...props}>
      <Text fontSize={22} color={theme.colors.fontBase.dark} fontWeight="700">
        {`It seems you haven't found an opponent via search and time ran out. 
        Click button below to unlock your accaunt!`}
      </Text>
      <AwardModalButton>
        <Button color="primary" onClick={handleSearchFinish}>
          Finish search
        </Button>
      </AwardModalButton>
    </StyledModal>
  )
}

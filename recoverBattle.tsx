import { pollingBattleInterval, pollingPoolMaxTime } from 'config'
import {
  BattleUserFrog,
  BattleUserPodium,
  BattleOpponentPodium,
  BattleSearchButtonContainer,
  BattleWrapper,
} from '../../components/battle/styles'
import Button from '../../components/button/Button'
import {
  useBattleContractWeb3,
  useCharacterContractWeb3,
  useFunderContractWeb3,
  useMainContractWeb3,
  useMmpoolContractWeb3,
  useModal,
} from '../../hooks'
import { MODAL } from '../../providers'
import { FullFillImage } from '../../components/FullFillImage/FullFillImage'
import LeftPodium from '../../components/battle/svg/left-podium.svg'
import RightPodium from '../../components/battle/svg/right-podium.svg'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { IHeroClass } from '../../types/IHeroClass'
import { IWinnerSide } from '../../components/battle/types'
import { getAnimationURL } from '../../components/battle/helpers'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { useSDK } from '../../sdk'
import { utils } from 'ethers'
import { WinEvent } from '../../generated/BattleAbi'
import { useAppDispatch, useAppSelector } from '../../state/hooks'
import { fetchIsBattleStarted } from '../../state/actions/battleActions'

import SoundEffectsWrapper from '../../components/SoundEffectsWrapper/SoundEffectsWrapper'
import { SOUNDS } from '../../components/SoundEffectsWrapper/constants'
import { CHARACTERS_BASE_DATA } from '../../constants/characters'

const BattleZone = () => {
  const dispatch = useAppDispatch()
  const { providerWeb3, account } = useSDK()
  const funderWeb3 = useFunderContractWeb3()
  const mainWeb3 = useMainContractWeb3()
  const battleWeb3 = useBattleContractWeb3()
  const characterWeb3 = useCharacterContractWeb3()
  const mmpoolWeb3 = useMmpoolContractWeb3()

  const isBattleStarted = useAppSelector(
    (store) => store.battle.isBattleStarted,
  )
  const selectedCharacter = useAppSelector(
    (store) => store.user.nftInfo.selectedCharacter,
  )

  const { openModal: openSearchModal, closeModal: closeSearchModal } = useModal(
    MODAL.search,
  )
  const { openModal: openFinishSearchModal } = useModal(MODAL.finishSearch)
  const { openModal: openBattleModal, closeModal: closeBattleModal } = useModal(
    MODAL.battle,
  )
  const { openModal: openAwardModal } = useModal(MODAL.rewards)
  const { openModal: openLoseModal } = useModal(MODAL.lose)
  const isTablet = useBreakpoint('md')
  const needPodiums = useMemo(() => !isTablet, [isTablet])
  const [isFlowActive, setIsFlowActive] = useState<boolean>(false)

  useEffect(() => {
    if (!isFlowActive && isBattleStarted && selectedCharacter.id !== 0) {
      handleStartMockedFlow()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBattleStarted, selectedCharacter.id])

  // TODO: split function to smaller pieces (refactor whole thing)
  const handleStartMockedFlow = useCallback(async () => {
    try {
      if (
        funderWeb3 &&
        mainWeb3 &&
        battleWeb3 &&
        characterWeb3 &&
        account &&
        mmpoolWeb3 &&
        providerWeb3
      ) {
        const getPoolBlockStatus = async (): Promise<number | null> => {
          const latestBlock = await providerWeb3.getBlockNumber()
          const eventFilterEnteredPool = mainWeb3.filters.PoolEntered(
            null,
            selectedCharacter.id,
          )
          const events = await mainWeb3.queryFilter(
            eventFilterEnteredPool,
            latestBlock - 1000,
            latestBlock,
          )

          if (events.length) {
            const latestEvent = events.reduce((prev, cur) => {
              if (cur.blockNumber >= prev.blockNumber) return cur
              return prev
            })
            return latestEvent.blockNumber
          } else {
            return null
          }
        }

        // Handling battle result event
        const getResultEvents = () => {
          return new Promise<WinEvent>((resolve) => {
            setInterval(async () => {
              const latestBlock = await providerWeb3.getBlockNumber()
              const eventFilterWin = battleWeb3.filters.Win(
                selectedCharacter.id,
                null,
              )
              const eventFilterLose = battleWeb3.filters.Win(
                null,
                selectedCharacter.id,
              )
              const eventsWin = await battleWeb3.queryFilter(
                eventFilterWin,
                latestBlock - 1000,
                latestBlock,
              )
              const eventsLose = await battleWeb3.queryFilter(
                eventFilterLose,
                latestBlock - 1000,
                latestBlock,
              )
              console.log('Win events:', eventsWin)
              console.log('Lose events:', eventsLose)
              console.log('----------------------------------')
              if (eventsLose.length || eventsWin.length) {
                resolve(
                  [...eventsWin, ...eventsLose].reduce((prev, cur) => {
                    if (cur.blockNumber >= prev.blockNumber) return cur
                    return prev
                  }),
                )
                clearInterval(this)
              }
            }, pollingBattleInterval)
          })
        }

        const waitForResultEvent = async () => {
          const resultEvent = await getResultEvents()

          const [winnerData, loserData] = await Promise.all([
            characterWeb3.characters(resultEvent.args.tokenIdWinner),
            characterWeb3.characters(resultEvent.args.tokenIdLoser),
          ])
          dispatch(
            fetchIsBattleStarted({ instanceRPC: characterWeb3, user: account }),
          )

          const classNameByClassId: IHeroClass[] = ['bow', 'nekr', 'war']

          const userClass: IHeroClass = classNameByClassId[winnerData.heroType]
          const opponentClass: IHeroClass =
            classNameByClassId[loserData.heroType]
          const winnerSide: IWinnerSide =
            +selectedCharacter.id === winnerData.heroType ? 'left' : 'right'

          const animationURL = await getAnimationURL(
            userClass,
            opponentClass,
            winnerSide,
          )
          setIsFlowActive(true)
          closeSearchModal()
          openBattleModal({
            animationURL,
            onClose: () => {
              setIsFlowActive(false)
              closeBattleModal()
              if (winnerSide === 'left') openAwardModal()
              if (winnerSide === 'right') openLoseModal()
            },
          })
        }
        // end of function declarations

        setIsFlowActive(true)

        // Handling the latest pool enter block timestamp (only if already in pool)
        if (isBattleStarted) {
          const enterPoolBlock = await getPoolBlockStatus()

          if (enterPoolBlock && enterPoolBlock < pollingPoolMaxTime) {
            const enterPoolTimestamp = (
              await providerWeb3.getBlock(enterPoolBlock)
            ).timestamp

            openSearchModal({
              ts: Math.floor(Date.now() / 1000 - enterPoolTimestamp),
            })

            await waitForResultEvent()
          } else {
            openFinishSearchModal()
          }
        }

        // Skip enter pool if tokenId already in pool
        if (!isBattleStarted) {
          openSearchModal({
            ts: 0,
          })
          const vrfMaticFee = await funderWeb3.getMinRequiredNativeToFund()
          const enterPoolTx = await mainWeb3.enterPool({
            value: vrfMaticFee.add(utils.parseUnits('0.01')),
          })
          await enterPoolTx.wait()
          dispatch(
            fetchIsBattleStarted({ instanceRPC: characterWeb3, user: account }),
          )

          await waitForResultEvent()
        }
      }
    } catch (e) {
      console.error(e)
      closeSearchModal()
      setIsFlowActive(false)
    }
  }, [
    funderWeb3,
    mainWeb3,
    battleWeb3,
    characterWeb3,
    account,
    mmpoolWeb3,
    providerWeb3,
    closeBattleModal,
    closeSearchModal,
    openLoseModal,
    openSearchModal,
    selectedCharacter.id,
    dispatch,
    isBattleStarted,
    openAwardModal,
    openBattleModal,
    openFinishSearchModal,
  ])
  return (
    <BattleWrapper>
      <BattleSearchButtonContainer>
        <SoundEffectsWrapper
          soundConfig={{
            onClick: SOUNDS.SELECT_SOUND,
            onHover: SOUNDS.HOVER_SOUND,
          }}
        >
          <Button color="primary" onClick={handleStartMockedFlow}>
            Search for opponent
          </Button>
        </SoundEffectsWrapper>
      </BattleSearchButtonContainer>

      {/*FROGS*/}
      {!isFlowActive && selectedCharacter.id !== 0 && (
        <BattleUserFrog>
          <FullFillImage
            src={CHARACTERS_BASE_DATA[selectedCharacter.class]?.image || ''}
          />
        </BattleUserFrog>
      )}

      {/*PODIUMS*/}
      {!isFlowActive && needPodiums && (
        <>
          <BattleUserPodium>
            <FullFillImage src={LeftPodium} />
          </BattleUserPodium>
          <BattleOpponentPodium>
            <FullFillImage src={RightPodium} />
          </BattleOpponentPodium>
        </>
      )}
    </BattleWrapper>
  )
}

export default BattleZone

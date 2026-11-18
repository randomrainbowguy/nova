function onCreate()
    setProperty('camGame.alpha', 0)
    setProperty('camHUD.alpha', 0)
    setProperty('cameraSpeed', 100)
    addLuaScript('custom_events/Cinematics')
end

local hideHud = {'iconP1', 'iconP2', 'scoreTxt', 'healthBar', 'healthBarBG', 'timeBar', 'timeBarBG', 'timeTxt'}
function onCreatePost()
    triggerEvent('Cinematics', '0.01', '180')

    for i = 1,#hideHud do
        setProperty(hideHud[i]..'.visible', false)
    end

    for i = 0,7 do
        setPropertyFromGroup('strumLineNotes', i, 'x', 8002)
    end
end


function onStepHit()
    if curStep == 1 then
        setProperty('camGame.alpha', 1)
        setProperty('camHUD.alpha', 1)
        doTweenAlpha('2', 'camGame', 0,1)

    elseif curStep == 15 or curStep == 47 or curStep == 79 or curStep == 111 then
        camX = 1100

    elseif curStep == 16 or curStep == 48 or curStep == 80 or curStep == 112 then
        setProperty('camGame.alpha', 1)
        doTweenAlpha('2', 'camGame', 0,1)

    elseif curStep == 31 or curStep == 63 or curStep == 95 then
        camX = 400

    elseif curStep == 32 or curStep == 64 or curStep == 96 then
        setProperty('camGame.alpha', 1)
        doTweenAlpha('2', 'camGame', 0,1)

    elseif curStep == 128 then

        setPropertyFromGroup('playerStrums', 0, 'x', defaultPlayerStrumX0)
        setPropertyFromGroup('playerStrums', 1, 'x', defaultPlayerStrumX1)
        setPropertyFromGroup('playerStrums', 2, 'x', defaultPlayerStrumX2)
        setPropertyFromGroup('playerStrums', 3, 'x', defaultPlayerStrumX3)

        setPropertyFromGroup('opponentStrums', 0, 'x', defaultOpponentStrumX0)
        setPropertyFromGroup('opponentStrums', 1, 'x', defaultOpponentStrumX1)
        setPropertyFromGroup('opponentStrums', 2, 'x', defaultOpponentStrumX2)
        setPropertyFromGroup('opponentStrums', 3, 'x', defaultOpponentStrumX3)

    for i = 1,#hideHud do
        setProperty(hideHud[i]..'.visible', true)
    end

        setProperty('camHUD.alpha', 1)

    elseif curStep == 1156 then
        doTweenAlpha('1', 'camHUD', 0, 1)

    end
end



function onEvent(n,v1)
    if n == 'camera_target' then
        if v1 == 'all' then
            folowcam = true
            camX = 770
        else
            folowcam = false
        end
    end
end



folowcam = true
camX = 400
camY = 600
function onUpdate()
    if folowcam then
        setProperty('camFollow.x', camX)
        setProperty('camFollow.y', camY)
    end
end
function onCreate()
    setProperty('camGame.alpha', 0)
    setProperty('camHUD.alpha', 0)
    setProperty('dad.alpha', 0)
end

function onSongStart()
    doTweenAlpha('3', 'camGame', 1, 10)
end


local hideHud = {'iconP1', 'iconP2', 'scoreTxt', 'healthBar', 'healthBarBG', 'timeBar', 'timeBarBG', 'timeTxt'}
function onEvent(n,v1)
    if n == 'camera_target' then
        if v1 == 'all' then
            folowcam = true
        else
            folowcam = false
        end
    end

    if n == 'hud' then
        for i = 1,#hideHud do
            if v1 == '1' then
            setProperty(hideHud[i]..'.visible', false)
            else
            setProperty(hideHud[i]..'.visible', true)
            end
        end
    end

    if n == 'GBG' then
        if v1 == 'on' then
            setProperty('laboratory.visible',false)
            else
            setProperty('laboratory.visible',true)
        end
    end
end


folowcam = false
camX = 1300
camY = 600
function onUpdate()
    if folowcam then
        setProperty('camFollow.x', camX)
        setProperty('camFollow.y', camY)
    end
end

function onStepHit()
    if curStep == 48 then
        doTweenAlpha('1', 'camHUD', 1, 0.8)

    elseif curStep == 60 then
        doTweenAlpha('3', 'camGame', 1, 0.5, 'expoOut')

    elseif curStep == 128 then
        setProperty('dad.alpha', 1)

    elseif curStep == 1932 then
        triggerEvent('hud','1')
    elseif curStep == 1952 then
        triggerEvent('hud',0)

    end
end
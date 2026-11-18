local chrColor = {'red', 'green', 'blue'}

function onCreatePost()
    setProperty('gf.visible', false)
    setProperty('boyfriend.visible',false)
    setProperty('dad.visible',false)
    setProperty('camGame.visible',false)
    setProperty('camHUD.visible',false)

    setObjectCamera('UpperBar', 'other')
    setObjectCamera('LowerBar', 'other')
end


local hideHud = {'iconP1', 'iconP2', 'scoreTxt', 'healthBar', 'healthBarBG', 'timeBar', 'timeBarBG', 'timeTxt'}
function onEvent(n,v1,v2)
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
            
        else
            
        end
    end
end


folowcam = true
camX = 600
camY = 600
function onUpdate()
    if folowcam then
        setProperty('camFollow.x', camX)
        setProperty('camFollow.y', camY)
    end
end


function onStepHit()
    if curStep == 1 then
        setProperty('camGame.visible', true)
        setProperty('boyfriend.visible',true)
        setProperty('dad.visible',true)
        camX = 600
        runTimer('coolOpp',0.01)
    elseif curStep == 128 then
        setProperty('camHUD.visible', true)
        setObjectCamera('UpperBar', 'hud')
        setObjectCamera('LowerBar', 'hud')
        camX = 700
        camY = 500

    end
end


function onMoveCamera(focus)
    if curStep < 128 then
        if focus == 'boyfriend' and mustHitSection == false then
            setProperty('cameraSpeed',100)
            camX = 1000
            runTimer('cool',0.02)
        elseif focus == 'dad' and mustHitSection == true then
            setProperty('cameraSpeed',100)
            camX = 600
            runTimer('coolOpp',0.02)
        end
    end
end

function onTimerCompleted(t)
    if t == 'coolOpp' then
        setProperty('cameraSpeed',3)
        camX = 300
        runTimer('coolOpp2',0.1)
    elseif t == 'coolOpp2' then
        setProperty('cameraSpeed',0.1)
    end

    if t == 'cool' then
        setProperty('cameraSpeed',3)
        camX = 1200
        runTimer('cool2',0.1)
    elseif t == 'cool2' then
        setProperty('cameraSpeed',0.1)
    end
end
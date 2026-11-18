function onCreate()
    addCharacterToList('SU/steven', 'dad')
    addCharacterToList('SU/steven-transform', 'dad')
    setProperty("skipArrowStartTween", true)

    makeAnimatedLuaSprite('stevanim', 'special_Anims/pussy')
    addAnimationByPrefix('stevanim', 'dialogue', 'Anim1', 24, true)
    scaleObject('stevanim', 1.1,1.1)
    addOffset('stevanim','dialogue',315,75)
    addLuaSprite('stevanim', true)

    makeAnimatedLuaSprite('gems', 'backgrounds/Stevenbg/bubbled-gems')
    addAnimationByPrefix('gems', 'idle', 'Bubble', 24, true)
    scaleObject('gems', 1.1,1.1)
    addLuaSprite('gems', true)

end

local hideHud = {'ground', 'sky', 'lion', 'goofyAhhDarkness', 'stevensword', 'clusterhand', 'moon', 'water', 'clouds', 'iconP1', 'iconP2', 'healthBar', 'healthBarBG', 'scoreTxt', 'timeBar', 'timeBarBG', 'timeTxt'}

function onCreatePost()
    setProperty('camGame.alpha', 0)
    setProperty('camHUD.alpha', 0)

    setProperty('stevanim.x', getProperty('dad.x'))
    setProperty('stevanim.y', getProperty('dad.y'))
    setProperty('stevanim.visible',false)

    setProperty('gems.x', getProperty('dad.x') - 340)
    setProperty('gems.y', getProperty('dad.y') - 90)
    setProperty('gems.visible',false)


    for i = 0,7 do
        noteTweenAlpha(i,i,0,0.01)
    end
end


function onEvent(n,v1,v2)
    if n == 'camera_target' then
        if v1 == 'all' then
            folowcam = true
            camX = 500
            camY = 400
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
            setProperty('ground.visible', false)
            triggerEvent('hud','1')
            if curStep > 1312 then
                setProperty('gems.colorTransform.color',0xff81be)
            end
        else
            triggerEvent('hud',0)
            if curStep > 1312 then
                setProperty("gems.colorTransform", nil)
                setProperty("gems.alpha", 0)
                setProperty("gems.alpha", 1)
            end
        end
    end
end



folowcam = false
camX = 500
camY = 400
function onUpdate()
    if folowcam then
        setProperty('camFollow.x', camX)
        setProperty('camFollow.y', camY)
    end
end



function onStepHit()
    if curStep == 16 then
        doTweenAlpha('1', 'camGame',1,10,'sineInOut')
        setProperty('camHUD.alpha', 1)

    elseif curStep == 120 then
        doTweenAlpha('1', 'camGame',0,0.65,'sineInOut')
        doTweenAlpha('2', 'camHUD',0,0.65,'sineInOut')

    elseif curStep == 128 then
        doTweenAlpha('1', 'camGame',1,0.54,'expoIn')
        doTweenAlpha('2', 'camHUD',1,0.54,'expoIn')

        for i = 0,7 do
            noteTweenAlpha('n'..i,i,1,0.01)
        end

    elseif curStep == 256 then
        for i = 0,7 do
            noteTweenAlpha('n'..i,i,0,1, 'expoOut')
        end

    elseif curStep == 280 then
        invertNote = true

    elseif curStep == 288 or curStep == 736 then
        invertNote = false

        beat = 1
        for i = 0,7 do
            noteTweenAlpha('n'..i,i,1,0.01)
        end


    elseif curStep == 536 or curStep == 671 or curStep == 1175 or curStep == 2208 then
        beat = 0

    elseif curStep == 544 or curStep == 928 then
        beat = 1

    elseif curStep == 732 then
        invertNote = true
        setProperty("dad.colorTransform", nil)
        setProperty("dad.alpha", 0)
        setProperty("dad.alpha", 1)

    elseif curStep == 1240 then
        for i = 10,#hideall do
            setProperty(hideall[i]..'.visible', false)
        end

        for i = 0,7 do
            noteTweenAlpha(i,i,0,0.01)
        end

    elseif curStep == 1293 then
        invertNote = true
        playAnim('stevanim','dialogue',true)
        setProperty('stevanim.visible',true)
        setProperty('dad.visible',false)

    elseif curStep == 1304 then
        invertNote = false
        doTweenAlpha('1', 'camGame',0,0.45,'sineInOut')
        doTweenAlpha('2', 'camHUD',0,0.45,'sineInOut')

    elseif curStep == 1311 then
        removeLuaSprite('stevanim',true)
        setProperty('dad.visible',true)

    elseif curStep == 1312 then
        doTweenAlpha('1', 'camGame',1,1,'sineInOut')
        doTweenAlpha('2', 'camHUD',1,1,'sineInOut')
        setProperty('gems.visible',true)
        for i = 0,7 do
            noteTweenAlpha('n'..i,i,1,0.01)
        end

        for i = 10,#hideall do
            setProperty(hideall[i]..'.visible', true)
        end


    elseif curStep == 1436 then
        doTweenAlpha('1', 'camGame',0,0.55,'sineInOut')
        doTweenAlpha('2', 'camHUD',0,0.55,'sineInOut')

    elseif curStep == 1446 then
        triggerEvent('hud','1')
        setProperty('boyfriend.visible', false)
        setProperty('gf.visible', false)


    elseif curStep == 1448 then
        doTweenAlpha('1', 'camGame',1,0.55,'sineInOut')

    elseif curStep == 1696 then
        setProperty('boyfriend.visible', true)
        setProperty('gf.visible', true)
        setProperty('camHUD.alpha', 1)
        beat = 1

    end
end


invertNote = false
color = {'red','green','blue'}
function opponentNoteHit(id, direction, noteType)
    if noteType == 'glitch_note' then
        for i = 1,3 do
            if invertNote == true then
                setProperty('dad.colorTransform.'..color[i]..'Offset', 255)
                setProperty('dad.colorTransform.'..color[i]..'Multiplier', -1)
                runTimer('removeInv', 0.1)
                if curStep >= 1293 and curStep <= 1295 then
                    setProperty('stevanim.colorTransform.'..color[i]..'Offset', 255)
                    setProperty('stevanim.colorTransform.'..color[i]..'Multiplier', -1)
                end
            end
        end
    end
end

function onTimerCompleted(t)
    if t == 'removeInv' then
        setProperty("dad.colorTransform", nil)
        setProperty("dad.alpha", 0)
        setProperty("dad.alpha", 1)
        if curStep >= 1293 and curStep <= 1296 then
            setProperty("stevanim.colorTransform", nil)
            setProperty("stevanim.alpha", 0)
            setProperty("stevanim.alpha", 1)
        end
    end
end

beat = 0
function onBeatHit()
    if curBeat %2 == 1 and beat == 1 then
        triggerEvent('Add Camera Zoom', 0.1,0.05)
    end
end
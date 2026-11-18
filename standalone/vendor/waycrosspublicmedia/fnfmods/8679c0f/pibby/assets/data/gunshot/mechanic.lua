function onCreate()
    precacheSound('shoot')

    makeAnimatedLuaSprite('Pico_attack', 'special_Anims/pico-shoot')
    addAnimationByPrefix('Pico_attack', 'attack', 'Shoot',24,false)
    addLuaSprite('Pico_attack', true)

    setProperty('Pico_attack.flipX', true)
    setProperty('Pico_attack.offset.x', -6)
    setProperty('Pico_attack.offset.y', 108)
end


function onCreatePost()--new pico assets for the attack anim only, to replace it with the actual pico
    setProperty('Pico_attack.visible', false)
end


function onStepHit()
    if curStep == 129 then
        setProperty('Pico_attack.x',getProperty('dad.x'))
        setProperty('Pico_attack.y',getProperty('dad.y'))
    end
end


cooldownOpp = false
function onBeatHit()
    if curBeat %getRandomInt(10,20) == 0 and getHealth() > 0.4 and cooldownOpp == false and getProperty('camGame.alpha') == 1 and getProperty('camHUD.alpha') == 1 and getProperty('healthBar.alpha') == 1 and getProperty('camGame.visible') == true and getProperty('camHUD.visible') == true and getProperty('healthBar.visible') == true then

        playAnim('Pico_attack', 'attack', true)

        setProperty('Pico_attack.visible', true)
        setProperty('dad.visible', false)

        triggerEvent('Play Animation','hit','bf')

        playSound('shoot', 1)
        triggerEvent('Screen Shake', '0.1,0.05', '0.1,0.05')
        addHealth(-0.23)
        runTimer('endanim', 0.55)
        runTimer('cooldownOpp', 5)
        cooldownOpp = true
    end
end


function onTimerCompleted(t)
    if t == 'endanim' then
        setProperty('Pico_attack.visible', false)
        setProperty('dad.visible', true)
    elseif t == 'cooldownOpp' then
        cooldownOpp = false
    end
end
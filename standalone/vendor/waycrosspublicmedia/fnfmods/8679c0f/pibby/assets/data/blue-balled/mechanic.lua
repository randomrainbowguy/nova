shakeGlit = false
function opponentNoteHit()
    if getHealth() > 0.05 then
        addHealth(-0.02)
    end

    if shakeGlit then
        luckyRoll = getRandomInt(1,50)
        luckyRoll2 = getRandomInt(1,50)


        if luckyRoll >= 48 then
            cameraShake('hud', 0.08, 0.05);
        end

        if luckyRoll2 >= 48 then
            cameraShake('game', 0.08, 0.05);
        end
    end
end


function onStepHit()
    if curStep == 512 then
        shakeGlit = true
    elseif curStep == 640 then
        shakeGlit = false
    end
end
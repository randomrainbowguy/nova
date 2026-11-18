function onCreate()
    setPropertyFromClass('GameOverSubstate', 'characterName', 'Game_Overs/pirate-GameOver')
end


function onGameOverStart()
    setProperty('boyfriend.alpha',0)
    runTimer('showbfGameOver',0.05)
    setShaderFloat("Shader1", "AMT", 0)
    setShaderFloat("Shader1", "SPEED", 0)
end

function onTimerCompleted(t)
    if t == 'showbfGameOver' then
        setProperty('boyfriend.alpha',1)
        setObjectCamera('boyfriend','other')
        setProperty('boyfriend.x',250)
        setProperty('boyfriend.y',100)
    end
end


function onGameOverConfirm(retry)
    doTweenAlpha('fadeIn','boyfriend',0,2,'quadIn')
end
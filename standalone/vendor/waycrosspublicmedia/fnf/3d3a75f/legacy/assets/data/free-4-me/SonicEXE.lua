function onCreatePost()
setHealthBarColors('332f2c', 'FFFF00')
setProperty('iconP1.alpha', 1)
setProperty('iconP2.alpha', 1)
setProperty('healthBar.alpha', 1)

makeLuaSprite('health', 'hpBar', 320, 620);
addLuaSprite('health', false)
setObjectCamera('health', 'HUD')
scaleObject('health', 1, 1)
setProperty('health.visible', true)

makeLuaSprite('healthEXE', 'hpBar-exe', 320, 620);
addLuaSprite('healthEXE', false)
setObjectCamera('healthEXE', 'HUD')
scaleObject('healthEXE', 1, 1)
setProperty('healthEXE.visible', false)
setProperty('healthEXE.alpha', 1)

scaleObject('healthBar', 1.04, 3)

scaleObject('scoreTxt', 1, 1)

end

function onUpdatePost()
setObjectOrder('healthBar', getObjectOrder('healthBar')+1)
setObjectOrder('health', getObjectOrder('health')+2)
setObjectOrder('healthEXE', getObjectOrder('healthEXE')+3)

setObjectOrder('iconP1', getObjectOrder('iconP1')+4)
setObjectOrder('iconP2', getObjectOrder('iconP2')+5)

setObjectOrder('scoreTxt', getObjectOrder('scoreTxt')+6)

if downscroll then
setProperty('health.y', 50)
setProperty('healthEXE.y', 50)
setProperty('healthBar.y', 70)
setProperty('scoreTxt.y', 120)

setProperty(‘health.angle’, 180)
 end
end

function onUpdate()
setProperty('healthBar.y', 633)
setProperty('scoreTxt.y', 690)
end
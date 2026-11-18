function onCreate()
    initLuaShader('CameraGlitch')
    initLuaShader('old film')
end

function onStepHit()
    if curStep == 896 then
makeLuaSprite("Shader3")
setSpriteShader("Shader3", "CameraGlitch")
setShaderBool('Shader3','vignetteOn',true)
setShaderBool('Shader3','vignetteMoving',true)

makeLuaSprite("Shader4")
setSpriteShader("Shader4", "old film")

runHaxeCode([[
trace(ShaderFilter);
game.camGame.setFilters([new ShaderFilter(game.getLuaObject("Shader3").shader),new ShaderFilter(game.getLuaObject("Shader4").shader)]);
game.camHUD.setFilters([new ShaderFilter(game.getLuaObject("Shader3").shader),new ShaderFilter(game.getLuaObject("Shader4").shader)]);
		]])
    elseif curStep == 1152 then
runHaxeCode([[
trace(ShaderFilter);
game.camGame.setFilters([new ShaderFilter(game.getLuaObject("Shader1").shader),new ShaderFilter(game.getLuaObject("Shader2").shader)]);
game.camHUD.setFilters([new ShaderFilter(game.getLuaObject("Shader1").shader),new ShaderFilter(game.getLuaObject("Shader2").shader)]);
		]])
setShaderFloat("Shader1", "AMT", 0)
setShaderFloat("Shader1", "SPEED", 0)

setShaderFloat("Shader2", "offsetIntensity", 0)
setShaderFloat("Shader2", "noiseQuality",100)
    end
end


function onUpdatePost()
    if curStep >= 896 and curStep < 1152 then
setShaderFloat("Shader3", "iTime", os.clock())
setShaderFloat("Shader4", "iTime", os.clock())
    end
end
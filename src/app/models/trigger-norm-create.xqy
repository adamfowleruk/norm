xquery version '1.0-ml';
import module namespace trgr='http://marklogic.com/xdmp/triggers' at '/MarkLogic/triggers.xqy';
import module namespace norm='http://marklogic.com/norm/main' at '/app/models/lib-norm.xqy';

declare variable $trgr:uri as xs:string external;
 
let $log := xdmp:log(fn:concat("****** NORM CREATE TRIGGER FIRED FOR: ",$trgr:uri))

let $normout := norm:generate-denormalisations($trgr:uri)
        
return not($normout = fn:false())